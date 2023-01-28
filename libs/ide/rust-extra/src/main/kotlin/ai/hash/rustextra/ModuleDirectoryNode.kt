package ai.hash.rustextra

import com.intellij.ide.projectView.ViewSettings
import com.intellij.ide.projectView.impl.nodes.PsiFileNode
import com.intellij.ide.util.treeView.AbstractTreeNode
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.intellij.util.containers.ContainerUtil

class ModuleDirectoryNode(project: Project, value: PsiFile, viewSettings: ViewSettings): PsiFileNode(project, value, viewSettings) {
    private val prepend = ContainerUtil.emptyList<AbstractTreeNode<*>>();

    fun addPrepend(element: AbstractTreeNode<*>) {
        prepend.add(element);
    }

    override fun getChildrenImpl(): MutableCollection<AbstractTreeNode<*>> {
        val children = ContainerUtil.emptyList<AbstractTreeNode<*>>()
        children.addAll(prepend);

        val parent = super.getChildrenImpl();
        if (parent != null) {
            children.addAll(parent);
        }

        return children;
    }


    companion object {
        fun fromPsiFileNode(node: PsiFileNode): ModuleDirectoryNode {
            return ModuleDirectoryNode(node.project, node.value, node.settings)
        }
    }
}